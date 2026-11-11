// § 09 Czyściciel · usuwa metadane ze zdjęć, PDF-ów i plików Office.
// JPG i PNG bezstratnie w przeglądarce, PDF przez pdf-lib, Office przez fflate,
// pozostałe formaty zdjęć (HEIC, WebP, TIFF) przepisuje serwer.
import { el, wybor, strefa, postep, listaWynikow, przedPo, api, wezFflate, LIB, bezRozszerzenia, rozszerzenie, opisBledu } from '../wspolne.js';
import { czyscJpeg, czyscPng, czyscPdf, czyscOffice, rodzaj } from './czysciciel-rdzen.js';

const TYPY = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', pdf: 'application/pdf' };

export async function start(korzen) {
  const autorzy = wybor('Zamień nazwiska autorów komentarzy i śledzonych zmian na „Autor”', true);
  const wlasne = wybor('Usuń właściwości niestandardowe, w tym etykiety poufności', true);
  const stan = postep();
  const wyniki = listaWynikow({ nazwaZip: 'pliki-czyste.zip' });
  let pdfLib = null;

  async function czysc(plik) {
    const bajty = new Uint8Array(await plik.arrayBuffer());
    const baza = bezRozszerzenia(plik.name), roz = rozszerzenie(plik.name);
    switch (rodzaj(bajty)) {
      case 'jpeg': { const w = czyscJpeg(bajty); return { ...w, nazwa: `${baza}-czysty.${roz || 'jpg'}`, typ: 'image/jpeg', miniatura: true }; }
      case 'png': { const w = czyscPng(bajty); return { ...w, nazwa: `${baza}-czysty.png`, typ: 'image/png', miniatura: true }; }
      case 'pdf': {
        pdfLib ??= await import(`${LIB}pdf-lib/pdf-lib.esm.min.js`);
        const w = await czyscPdf(bajty, pdfLib);
        return { ...w, nazwa: `${baza}-czysty.pdf`, typ: 'application/pdf' };
      }
      case 'zip': {
        const w = czyscOffice(bajty, await wezFflate(), { autorzy: autorzy.pole.checked, wlasne: wlasne.pole.checked });
        return { ...w, nazwa: `${baza}-czysty.${roz || 'docx'}`, typ: plik.type || 'application/octet-stream' };
      }
      case 'inny-obraz': {
        const { blob, info } = await api('oczysc', { plik });
        return { blob, nazwa: (info.nazwa || `${baza}.jpg`).replace(/(\.[a-z]+)$/, '-czysty$1'), raport: ['Zdjęcie zapisane od nowa, bez metadanych (ten format wymaga ponownego kodowania)'], miniatura: true };
      }
      default:
        throw new Error('Nie obsługuję tego typu pliku. Działam na zdjęciach, PDF-ach oraz plikach Word, Excel i PowerPoint.');
    }
  }

  async function przerob(pliki) {
    let nr = 0;
    for (const plik of pliki) {
      nr++;
      stan.ustaw(`Czyszczę ${nr} z ${pliki.length}: ${plik.name}`, (nr - 1) / pliki.length);
      try {
        const w = await czysc(plik);
        const blob = w.blob || new Blob([w.dane], { type: w.typ || TYPY[rozszerzenie(w.nazwa)] || 'application/octet-stream' });
        wyniki.dodaj({
          nazwa: w.nazwa,
          opis: [...przedPo(plik.size, blob.size), w.raport.length ? ' · usunięto:' : ' · nie znalazłem metadanych'],
          blob, miniatura: w.miniatura ? blob : null, szczegoly: w.raport,
        });
      } catch (e) {
        wyniki.dodaj({ nazwa: plik.name, opis: opisBledu(e), blad: true });
      }
    }
    stan.ukryj();
  }

  korzen.append(
    el('div', { class: 'opcje' },
      el('div', { class: 'pole szerokie' }, el('span', { class: 'etykieta', text: 'Pliki Word, Excel, PowerPoint' }), autorzy, wlasne)),
    strefa({
      tytul: 'Upuść pliki albo kliknij, żeby wybrać',
      opis: 'Zdjęcia (JPG, PNG, HEIC, WebP), PDF, DOCX, XLSX, PPTX. Lista pokaże, co było w środku.',
      accept: 'image/*,.heic,.heif,.pdf,.docx,.xlsx,.pptx,.docm,.xlsm,.pptm', wiele: true, naPliki: przerob,
    }),
    stan.el, wyniki.el,
    el('div', { class: 'uwaga' }, el('p', { text: 'Czyściciel usuwa to, co plik niesie obok treści: autora, firmę, daty, GPS, historię programu. Nie zagląda do treści: nazwisko w stopce dokumentu albo twarz na zdjęciu zostają.' })));
}
