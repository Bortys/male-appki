// Przybornik · wspólne wczytywanie bibliotek PDF: pdf.js (podgląd stron) i pdf-lib (składanie plików).
import { LIB, nowePlotno } from './wspolne.js';

let pdfjs = null;
let pdfLib = null;

export async function wezPdfjs() {
  if (!pdfjs) {
    pdfjs = await import(`${LIB}pdfjs/pdf.min.mjs`);
    pdfjs.GlobalWorkerOptions.workerSrc = `${LIB}pdfjs/pdf.worker.min.mjs`;
  }
  return pdfjs;
}

export async function wezPdfLib() {
  pdfLib ??= await import(`${LIB}pdf-lib/pdf-lib.esm.min.js`);
  return pdfLib;
}

/** Otwiera PDF do podglądu. Dostaje kopię bajtów, bo pdf.js oddaje bufor swojemu robotnikowi. */
export async function otworzPdf(bajty) {
  const biblioteka = await wezPdfjs();
  try {
    return await biblioteka.getDocument({
      data: bajty.slice(),
      wasmUrl: `${LIB}pdfjs/wasm/`,
      standardFontDataUrl: `${LIB}pdfjs/standard_fonts/`,
      iccUrl: `${LIB}pdfjs/iccs/`,
      isEvalSupported: false,
    }).promise;
  } catch (e) {
    if (e?.name === 'PasswordException') throw new Error('PDF jest zabezpieczony hasłem. Najpierw zdejmij zabezpieczenie.');
    throw new Error('Nie udało się otworzyć tego PDF-a.');
  }
}

/** Rysuje stronę na nowym płótnie. Podaj szerokość w pikselach albo skalę (1 = 72 dpi). */
export async function rysujStrone(strona, { szerokosc = null, skala = null, tlo = '#FFFFFF' } = {}) {
  const bazowy = strona.getViewport({ scale: 1 });
  const s = skala ?? (szerokosc / bazowy.width);
  const widok = strona.getViewport({ scale: s });
  const plotno = nowePlotno(widok.width, widok.height);
  await strona.render({ canvas: plotno, viewport: widok, background: tlo }).promise;
  return plotno;
}
