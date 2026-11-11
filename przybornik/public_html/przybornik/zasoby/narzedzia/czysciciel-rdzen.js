// Czyściciel · czyste funkcje bez DOM (testowane w Node: tests/js/czysciciel.test.mjs).
// Każda przyjmuje bajty pliku i zwraca { dane: Uint8Array, raport: string[] }.

const ascii = (b, od, ile) => String.fromCharCode(...b.subarray(od, Math.min(b.length, od + ile)));

/* === JPEG ===================================================================
   Bezstratnie: wycinamy segmenty z metadanymi, dane obrazu zostają bajt w bajt.
   Zostają: JFIF, profil kolorów ICC, znacznik Adobe (potrzebny do dekodowania)
   oraz, jeśli zdjęcie było obrócone, minimalny EXIF z samą orientacją.
   ============================================================================ */

const TAGI_EXIF = {
  0x010F: 'Producent aparatu', 0x0110: 'Model aparatu', 0x0131: 'Oprogramowanie', 0x0132: 'Data',
  0x013B: 'Autor', 0x8298: 'Prawa autorskie', 0x9003: 'Data wykonania', 0xA434: 'Obiektyw',
  0xA431: 'Numer seryjny aparatu', 0xA430: 'Właściciel aparatu', 0x010E: 'Opis',
};

/** Czyta wybrane pola EXIF. Zwraca { orientacja, pola: [[nazwa, wartość]], gps }. */
export function czytajExif(b, start) {
  const wynik = { orientacja: 1, pola: [], gps: false };
  const t = start;                                     // początek nagłówka TIFF
  const le = b[t] === 0x49 && b[t + 1] === 0x49;
  if (!le && !(b[t] === 0x4D && b[t + 1] === 0x4D)) return wynik;
  const u16 = (p) => (le ? b[p] | (b[p + 1] << 8) : (b[p] << 8) | b[p + 1]);
  const u32 = (p) => (le ? (b[p] | (b[p + 1] << 8) | (b[p + 2] << 16) | (b[p + 3] << 24)) : ((b[p] << 24) | (b[p + 1] << 16) | (b[p + 2] << 8) | b[p + 3])) >>> 0;
  const ifd = (poz, glebiej) => {
    if (poz <= 0 || t + poz + 2 > b.length) return;
    const ile = u16(t + poz);
    for (let i = 0; i < ile && i < 200; i++) {
      const w = t + poz + 2 + i * 12;
      if (w + 12 > b.length) return;
      const tag = u16(w), typ = u16(w + 2), licznik = u32(w + 4);
      if (tag === 0x0112) wynik.orientacja = u16(w + 8);
      else if (tag === 0x8825) wynik.gps = true;
      else if (tag === 0x8769 && glebiej) ifd(u32(w + 8), false);
      else if (TAGI_EXIF[tag] && typ === 2 && licznik > 0 && licznik < 200) {
        const od = licznik <= 4 ? w + 8 : t + u32(w + 8);
        if (od + licznik <= b.length) {
          const tekst = ascii(b, od, licznik).replace(/\0+$/, '').trim();
          if (tekst) wynik.pola.push([TAGI_EXIF[tag], tekst]);
        }
      }
    }
  };
  ifd(u32(t + 4), true);
  return wynik;
}

function exifZOrientacja(o) {
  return new Uint8Array([
    0xFF, 0xE1, 0x00, 0x22, 0x45, 0x78, 0x69, 0x66, 0x00, 0x00,          // APP1, długość 34, "Exif\0\0"
    0x4D, 0x4D, 0x00, 0x2A, 0x00, 0x00, 0x00, 0x08,                      // TIFF big-endian, IFD0 od 8
    0x00, 0x01, 0x01, 0x12, 0x00, 0x03, 0x00, 0x00, 0x00, 0x01, 0x00, o, 0x00, 0x00,   // 1 wpis: Orientation
    0x00, 0x00, 0x00, 0x00,                                              // brak kolejnego IFD
  ]);
}

/** Pozycja tuż za znacznikiem końca obrazu (EOI), licząc od pierwszego SOS. */
function koniecObrazu(b, poz) {
  for (;;) {
    if (poz + 4 > b.length || b[poz] !== 0xFF) return b.length;
    const m = b[poz + 1];
    if (m === 0xD9) return poz + 2;
    poz += 2 + ((b[poz + 2] << 8) | b[poz + 3]);
    if (m !== 0xDA) continue;
    // dane skanu: FF00 to zwykły bajt, FFD0–FFD7 to znaczniki restartu
    for (;;) {
      poz = b.indexOf(0xFF, poz);
      if (poz < 0 || poz + 1 >= b.length) return b.length;
      const n = b[poz + 1];
      if (n === 0x00 || (n >= 0xD0 && n <= 0xD7)) { poz += 2; continue; }
      if (n === 0xFF) { poz += 1; continue; }
      break;
    }
  }
}

export function czyscJpeg(b) {
  if (b[0] !== 0xFF || b[1] !== 0xD8) throw new Error('To nie jest plik JPEG.');
  const czesci = [b.subarray(0, 2)];
  const raport = [];
  let orientacja = 1;
  let poz = 2;
  let inne = 0;
  while (poz + 4 <= b.length) {
    if (b[poz] !== 0xFF) throw new Error('Plik JPEG jest uszkodzony.');
    const m = b[poz + 1];
    if (m === 0xFF) { poz++; continue; }
    if (m === 0xDA || m === 0xD9) break;
    const dl = (b[poz + 2] << 8) | b[poz + 3];
    const segment = b.subarray(poz, poz + 2 + dl);
    const id = ascii(b, poz + 4, 30);
    let zostaje = true;
    if (m === 0xE1) {
      zostaje = false;
      if (id.startsWith('Exif\0\0')) {
        const exif = czytajExif(b, poz + 10);
        orientacja = exif.orientacja;
        if (exif.gps) raport.push('Współrzędne GPS');
        for (const [nazwa, wartosc] of exif.pola) raport.push(`${nazwa}: ${wartosc}`);
        if (!exif.gps && !exif.pola.length) raport.push('Dane EXIF');
      } else if (id.startsWith('http://ns.adobe.com/x')) raport.push('Metadane XMP');
      else inne++;
    } else if (m === 0xE0) { zostaje = id.startsWith('JFIF\0'); if (!zostaje) raport.push('Wbudowana miniatura'); }
    else if (m === 0xE2) { zostaje = id.startsWith('ICC_PROFILE\0'); if (!zostaje) inne++; }
    else if (m === 0xEE) { zostaje = id.startsWith('Adobe'); if (!zostaje) inne++; }
    else if (m === 0xED) { zostaje = false; raport.push('Dane IPTC i Photoshopa'); }
    else if (m === 0xEB) { zostaje = false; raport.push('Podpis pochodzenia treści (C2PA)'); }
    else if (m >= 0xE3 && m <= 0xEF) { zostaje = false; inne++; }
    else if (m === 0xFE) { zostaje = false; raport.push('Komentarz w pliku'); }
    if (zostaje) czesci.push(segment);
    poz += 2 + dl;
  }
  const koniec = koniecObrazu(b, poz);
  czesci.push(b.subarray(poz, koniec));
  if (koniec < b.length - 1) raport.push(`Dane doklejone za obrazem (${Math.round((b.length - koniec) / 1024)} KB, np. wideo Live Photo albo mapa głębi)`);
  if (inne) raport.push(`Inne bloki producenta: ${inne}`);
  if (orientacja >= 2 && orientacja <= 8) czesci.splice(1, 0, exifZOrientacja(orientacja));
  return { dane: sklej(czesci), raport: [...new Set(raport)] };
}

/* === PNG ==================================================================== */

const PNG_ZOSTAJE = new Set(['IHDR', 'PLTE', 'IDAT', 'IEND', 'tRNS', 'gAMA', 'cHRM', 'sRGB', 'iCCP', 'sBIT', 'bKGD', 'pHYs', 'hIST', 'sPLT', 'acTL', 'fcTL', 'fdAT', 'cICP', 'mDCV', 'cLLI']);

export function czyscPng(b) {
  const podpis = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];
  if (!podpis.every((v, i) => b[i] === v)) throw new Error('To nie jest plik PNG.');
  const czesci = [b.subarray(0, 8)];
  const raport = [];
  let poz = 8;
  while (poz + 12 <= b.length) {
    const dl = ((b[poz] << 24) | (b[poz + 1] << 16) | (b[poz + 2] << 8) | b[poz + 3]) >>> 0;
    const typ = ascii(b, poz + 4, 4);
    const calosc = 12 + dl;
    if (poz + calosc > b.length) throw new Error('Plik PNG jest uszkodzony.');
    if (PNG_ZOSTAJE.has(typ)) czesci.push(b.subarray(poz, poz + calosc));
    else if (typ === 'tEXt' || typ === 'iTXt' || typ === 'zTXt') {
      const klucz = ascii(b, poz + 8, Math.min(dl, 80)).split('\0')[0];
      raport.push(`Opis tekstowy: ${klucz}`);
    } else if (typ === 'eXIf') raport.push('Dane EXIF');
    else if (typ === 'tIME') raport.push('Data zmiany pliku');
    else raport.push(`Blok dodatkowy ${typ}`);
    poz += calosc;
    if (typ === 'IEND') break;
  }
  if (poz < b.length) raport.push('Dane doklejone za obrazem');
  return { dane: sklej(czesci), raport: [...new Set(raport)] };
}

/* === PDF (pdf-lib przekazywane z zewnątrz) ================================== */

const POLA_PDF = {
  Title: 'Tytuł', Author: 'Autor', Subject: 'Temat', Keywords: 'Słowa kluczowe', Creator: 'Program źródłowy',
  Producer: 'Generator PDF', CreationDate: 'Data utworzenia', ModDate: 'Data zmiany', Company: 'Firma', Manager: 'Menedżer',
};

export async function czyscPdf(bajty, PDFLib) {
  const { PDFDocument, PDFName, PDFDict, PDFRef, PDFString, PDFHexString, PDFStream } = PDFLib;
  let doc;
  try {
    doc = await PDFDocument.load(bajty, { updateMetadata: false });
  } catch (e) {
    if (/encrypt/i.test(String(e?.message))) throw new Error('PDF jest zabezpieczony hasłem. Najpierw zdejmij zabezpieczenie.');
    throw new Error('Nie udało się otworzyć tego PDF-a.');
  }
  const k = doc.context;
  const raport = [];

  const refInfo = k.trailerInfo.Info;
  const info = refInfo ? k.lookup(refInfo) : null;
  if (info instanceof PDFDict) {
    for (const [klucz, wartosc] of info.entries()) {
      const nazwa = klucz.decodeText ? klucz.decodeText() : String(klucz).replace(/^\//, '');
      const w = k.lookup(wartosc);
      const tekst = (w instanceof PDFString || w instanceof PDFHexString) ? w.decodeText() : '';
      if (tekst) raport.push(`${POLA_PDF[nazwa] || nazwa}: ${tekst.replace(/^D:(\d{4})(\d{2})(\d{2}).*$/, '$1-$2-$3')}`);
    }
    if (refInfo instanceof PDFRef) k.delete(refInfo);
  }
  k.trailerInfo.Info = undefined;

  const Metadata = PDFName.of('Metadata'), Type = PDFName.of('Type'), PieceInfo = PDFName.of('PieceInfo');
  let xmp = 0, prywatne = 0;
  for (const [ref, obiekt] of k.enumerateIndirectObjects()) {
    const slownik = obiekt instanceof PDFDict ? obiekt : (obiekt instanceof PDFStream ? obiekt.dict : null);
    if (!slownik) continue;
    if (slownik.get(Type) === Metadata) { k.delete(ref); xmp++; continue; }
    if (slownik.has(Metadata)) slownik.delete(Metadata);
    if (slownik.has(PieceInfo)) { slownik.delete(PieceInfo); prywatne++; }
  }
  if (xmp) raport.push(`Metadane XMP: ${xmp}`);
  if (prywatne) raport.push(`Prywatne dane programów (PieceInfo): ${prywatne}`);

  const dane = await doc.save();
  return { dane, raport };
}

/* === Office: docx, xlsx, pptx (fflate przekazywane z zewnątrz) ============== */

const PUSTY_CORE = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"></cp:coreProperties>';
const PUSTY_CUSTOM = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/custom-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"></Properties>';

const POLA_CORE = [
  ['dc:creator', 'Autor'], ['cp:lastModifiedBy', 'Ostatnio zmienił'], ['dc:title', 'Tytuł'], ['dc:subject', 'Temat'],
  ['dc:description', 'Opis'], ['cp:keywords', 'Słowa kluczowe'], ['cp:category', 'Kategoria'],
  ['dcterms:created', 'Utworzono'], ['dcterms:modified', 'Zmieniono'], ['cp:lastPrinted', 'Drukowano'], ['cp:revision', 'Numer wersji'],
];
const POLA_APP = [['Company', 'Firma'], ['Manager', 'Menedżer'], ['Template', 'Szablon'], ['HyperlinkBase', 'Baza odnośników']];

const odkoduj = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');

export function czyscOffice(bajty, fflate, { autorzy = true, wlasne = true } = {}) {
  let pliki;
  try { pliki = fflate.unzipSync(bajty); } catch { throw new Error('Nie udało się otworzyć pliku Office.'); }
  if (!pliki['[Content_Types].xml']) throw new Error('To nie jest plik Word, Excel ani PowerPoint.');
  const dek = new TextDecoder(), kod = new TextEncoder();
  const raport = [];

  if (pliki['docProps/core.xml']) {
    const xml = dek.decode(pliki['docProps/core.xml']);
    for (const [znacznik, nazwa] of POLA_CORE) {
      const m = new RegExp(`<${znacznik}[^>]*>([^<]*)</${znacznik}>`).exec(xml);
      if (m && m[1].trim()) raport.push(`${nazwa}: ${odkoduj(m[1].trim())}`);
    }
    pliki['docProps/core.xml'] = kod.encode(PUSTY_CORE);
  }

  if (pliki['docProps/app.xml']) {
    let xml = dek.decode(pliki['docProps/app.xml']);
    for (const [znacznik, nazwa] of POLA_APP) {
      const wzor = new RegExp(`<${znacznik}>([^<]*)</${znacznik}>`);
      const m = wzor.exec(xml);
      if (m && m[1].trim()) raport.push(`${nazwa}: ${odkoduj(m[1].trim())}`);
      xml = xml.replace(wzor, '').replace(new RegExp(`<${znacznik}\\s*/>`), '');
    }
    xml = xml.replace(/<TotalTime>[^<]*<\/TotalTime>/, '<TotalTime>0</TotalTime>');
    pliki['docProps/app.xml'] = kod.encode(xml);
  }

  if (wlasne && pliki['docProps/custom.xml']) {
    const xml = dek.decode(pliki['docProps/custom.xml']);
    const nazwy = [...xml.matchAll(/<property\b[^>]*\bname="([^"]*)"/g)].map((m) => odkoduj(m[1]));
    if (nazwy.length) {
      const etykiety = nazwy.filter((n) => /^MSIP_Label|^Sensitivity|^ClassificationContentMarking/i.test(n)).length;
      raport.push(`Właściwości niestandardowe: ${nazwy.length}` + (etykiety ? ' (w tym etykieta poufności)' : ` (${nazwy.slice(0, 3).join(', ')}${nazwy.length > 3 ? '…' : ''})`));
    }
    pliki['docProps/custom.xml'] = kod.encode(PUSTY_CUSTOM);
  }

  // Ścieżka szablonu w Wordzie zdradza nazwę użytkownika i układ dysku
  const relSzablonu = 'word/_rels/settings.xml.rels';
  if (pliki[relSzablonu]) {
    const xml = dek.decode(pliki[relSzablonu]);
    const nowy = xml.replace(/(<Relationship\b[^>]*attachedTemplate"[^>]*\bTarget=")([^"]*)(")/g, (_, a, sciezka, c) => {
      if (/[\\/]/.test(sciezka)) raport.push(`Ścieżka szablonu: ${odkoduj(decodeURIComponent(sciezka.replace(/^file:\/\/\//, '')))}`);
      return `${a}Normal.dotm${c}`;
    });
    if (nowy !== xml) pliki[relSzablonu] = kod.encode(nowy);
  }

  if (autorzy) {
    const osoby = new Set();
    const podmien = (xml, wzor, nowa) => xml.replace(wzor, (calosc, przed, stara, po) => {
      if (stara && stara !== nowa) osoby.add(odkoduj(stara));
      return `${przed}${nowa}${po}`;
    });
    for (const nazwa of Object.keys(pliki)) {
      if (!/^(word|ppt|xl)\/.*\.xml$/.test(nazwa)) continue;
      const xml = dek.decode(pliki[nazwa]);
      let nowy = xml;
      if (nazwa.startsWith('word/')) {
        nowy = podmien(nowy, /(\bw\d*:author=")([^"]*)(")/g, 'Autor');
        nowy = nowy.replace(/(\bw\d*:initials=")[^"]*(")/g, '$1A$2').replace(/(\bw\d*:userId=")[^"]*(")/g, '$1$2');
      } else if (/^ppt\/(commentAuthors|authors)\.xml$/.test(nazwa)) {
        nowy = podmien(nowy, /(\bname=")([^"]*)(")/g, 'Autor');
        nowy = nowy.replace(/(\binitials=")[^"]*(")/g, '$1A$2').replace(/(\buserId=")[^"]*(")/g, '$1$2');
      } else if (/^xl\/comments\d*\.xml$/.test(nazwa)) {
        nowy = podmien(nowy, /(<author>)([^<]*)(<\/author>)/g, 'Autor');
      } else if (/^xl\/persons\/.*\.xml$/.test(nazwa)) {
        nowy = podmien(nowy, /(\bdisplayName=")([^"]*)(")/g, 'Autor');
        nowy = nowy.replace(/(\buserId=")[^"]*(")/g, '$1$2');
      }
      if (nowy !== xml) pliki[nazwa] = kod.encode(nowy);
    }
    if (osoby.size) raport.push(`Autorzy komentarzy i zmian: ${[...osoby].slice(0, 6).join(', ')}${osoby.size > 6 ? '…' : ''}`);
  }

  return { dane: fflate.zipSync(pliki, { level: 6 }), raport };
}

/* === Rozpoznawanie typu ====================================================== */

/** 'jpeg' | 'png' | 'pdf' | 'zip' | 'inny-obraz' | null */
export function rodzaj(b) {
  if (b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF) return 'jpeg';
  if (b[0] === 0x89 && ascii(b, 1, 3) === 'PNG') return 'png';
  if (ascii(b, 0, 5) === '%PDF-') return 'pdf';
  if (b[0] === 0x50 && b[1] === 0x4B && (b[2] === 0x03 || b[2] === 0x05)) return 'zip';
  const poczatek = ascii(b, 0, 12);
  if (poczatek.startsWith('RIFF') && poczatek.endsWith('WEBP')) return 'inny-obraz';
  if (poczatek.slice(4, 8) === 'ftyp') return 'inny-obraz';
  if (poczatek.startsWith('GIF8') || poczatek.startsWith('II*\0') || poczatek.startsWith('MM\0*') || poczatek.startsWith('BM')) return 'inny-obraz';
  return null;
}

function sklej(czesci) {
  const wynik = new Uint8Array(czesci.reduce((s, c) => s + c.length, 0));
  let poz = 0;
  for (const c of czesci) { wynik.set(c, poz); poz += c.length; }
  return wynik;
}
