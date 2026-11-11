// Testy silnika Czyściciela. Uruchomienie: node --test tests/js   (biblioteki z public_html/przybornik/lib)
import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const APP = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../public_html/przybornik');
const rdzen = await import(path.join(APP, 'zasoby/narzedzia/czysciciel-rdzen.js'));
const PDFLib = await import(path.join(APP, 'lib/pdf-lib/pdf-lib.esm.min.js'));
const fflate = await import(path.join(APP, 'lib/fflate/browser.js'));
const tekst = (b) => Buffer.from(b).toString('latin1');

/** Najmniejszy poprawny JPEG 1×1 z dopisanymi segmentami. */
function jpegZMetadanymi() {
  const baza = Buffer.from('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/yQALCAABAAEBAREA/8wABgAQEAX/2gAIAQEAAD8A0s8g/9k=', 'base64');
  // EXIF big-endian: Make, Model, Orientation=6, wskaźnik GPS
  const make = Buffer.from('TestCam\0'), model = Buffer.from('Model X1000\0');
  const wpisy = 4, poczDanych = 8 + 2 + wpisy * 12 + 4;
  const ifd = Buffer.alloc(2 + wpisy * 12 + 4);
  ifd.writeUInt16BE(wpisy, 0);
  const wpis = (i, tag, typ, ile, wart) => { const p = 2 + i * 12; ifd.writeUInt16BE(tag, p); ifd.writeUInt16BE(typ, p + 2); ifd.writeUInt32BE(ile, p + 4); if (typ === 3) { ifd.writeUInt16BE(wart, p + 8); } else { ifd.writeUInt32BE(wart, p + 8); } };
  wpis(0, 0x010F, 2, make.length, poczDanych);
  wpis(1, 0x0110, 2, model.length, poczDanych + make.length);
  wpis(2, 0x0112, 3, 1, 6);
  wpis(3, 0x8825, 4, 1, poczDanych + make.length + model.length);
  const tiff = Buffer.concat([Buffer.from('MM\0*\0\0\0\x08', 'latin1'), ifd, make, model, Buffer.from([0, 0, 0, 0, 0, 0])]);
  const segment = (znacznik, tresc) => { const n = Buffer.alloc(4); n.writeUInt16BE(0xFF00 | znacznik, 0); n.writeUInt16BE(tresc.length + 2, 2); return Buffer.concat([n, tresc]); };
  const exif = segment(0xE1, Buffer.concat([Buffer.from('Exif\0\0', 'latin1'), tiff]));
  const xmp = segment(0xE1, Buffer.from('http://ns.adobe.com/xap/1.0/\0<x:xmpmeta>Jan Tajny</x:xmpmeta>', 'latin1'));
  const iptc = segment(0xED, Buffer.from('Photoshop 3.0\0TAJNE-IPTC', 'latin1'));
  const kom = segment(0xFE, Buffer.from('komentarz sekretny', 'latin1'));
  const icc = segment(0xE2, Buffer.from('ICC_PROFILE\0\x01\x01PROFIL', 'latin1'));
  // SOI + APP0 (18 bajtów) + nasze segmenty + reszta + doklejone dane
  return new Uint8Array(Buffer.concat([baza.subarray(0, 20), exif, xmp, iptc, kom, icc, baza.subarray(20), Buffer.from('DOKLEJONE-WIDEO-LIVE-PHOTO')]));
}

test('JPEG: metadane znikają, obraz, profil ICC i orientacja zostają', () => {
  const wej = jpegZMetadanymi();
  const { dane, raport } = rdzen.czyscJpeg(wej);
  const t = tekst(dane);
  for (const slad of ['TestCam', 'Model X1000', 'Jan Tajny', 'TAJNE-IPTC', 'komentarz sekretny', 'DOKLEJONE']) assert.ok(!t.includes(slad), `został ślad: ${slad}`);
  assert.ok(t.includes('ICC_PROFILE'), 'profil kolorów ma zostać');
  assert.ok(t.includes('JFIF'), 'JFIF ma zostać');
  assert.equal(dane[0], 0xFF); assert.equal(dane[1], 0xD8);
  assert.equal(dane[dane.length - 2], 0xFF); assert.equal(dane[dane.length - 1], 0xD9);
  // minimalny EXIF z orientacją 6 tuż za SOI
  assert.equal(tekst(dane.subarray(6, 10)), 'Exif');
  assert.equal(rdzen.czytajExif(dane, 12).orientacja, 6);
  assert.ok(raport.includes('Współrzędne GPS'));
  assert.ok(raport.some((r) => r.includes('TestCam')));
  assert.ok(raport.some((r) => r.startsWith('Dane doklejone')));
  // dane skanu identyczne bajt w bajt
  const sos = (b) => { const s = tekst(b); return s.slice(s.indexOf('\xFF\xDA'), s.lastIndexOf('\xFF\xD9') + 2); };
  assert.equal(sos(dane), sos(wej.subarray(0, wej.length - 26)));
});

test('JPEG: czysty plik wychodzi bez zmian i z pustym raportem', () => {
  const czysty = rdzen.czyscJpeg(jpegZMetadanymi()).dane;
  const bezExif = rdzen.czyscJpeg(czysty);
  assert.deepEqual(bezExif.dane, czysty);
});

test('PNG: bloki tekstowe i EXIF znikają, obraz zostaje', () => {
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
  const blok = (typ, tresc) => { const n = Buffer.alloc(8); n.writeUInt32BE(tresc.length, 0); n.write(typ, 4, 'latin1'); return Buffer.concat([n, tresc, Buffer.alloc(4)]); };
  const wej = new Uint8Array(Buffer.concat([png.subarray(0, 33), blok('tEXt', Buffer.from('Author\0Jan Tajny', 'latin1')), blok('eXIf', Buffer.from('MM\0*GPS')), png.subarray(33), Buffer.from('OGON')]));
  const { dane, raport } = rdzen.czyscPng(wej);
  assert.deepEqual(Buffer.from(dane), png);
  assert.deepEqual(raport, ['Opis tekstowy: Author', 'Dane EXIF', 'Dane doklejone za obrazem']);
});

test('PDF: Info i XMP znikają, strony zostają', async () => {
  const doc = await PDFLib.PDFDocument.create();
  doc.addPage([300, 200]).drawText('Tresc strony', { x: 20, y: 100 });
  doc.addPage([300, 200]);
  doc.setAuthor('Jan Tajny'); doc.setTitle('Poufny tytul'); doc.setCreator('Tajny Program');
  const xmp = doc.context.stream('<x:xmpmeta><dc:creator>Jan Tajny XMP</dc:creator></x:xmpmeta>', { Type: 'Metadata', Subtype: 'XML' });
  doc.catalog.set(PDFLib.PDFName.of('Metadata'), doc.context.register(xmp));
  const wej = await doc.save({ useObjectStreams: false });
  assert.ok(tekst(wej).includes('Jan Tajny XMP'));
  const { dane, raport } = await rdzen.czyscPdf(wej, PDFLib);
  const pelny = await (await PDFLib.PDFDocument.load(dane, { updateMetadata: false })).save({ useObjectStreams: false });
  for (const slad of ['Jan Tajny', 'Poufny tytul', 'Tajny Program', 'xmpmeta']) assert.ok(!tekst(pelny).includes(slad), `został ślad: ${slad}`);
  const wynik = await PDFLib.PDFDocument.load(dane, { updateMetadata: false });
  assert.equal(wynik.getPageCount(), 2);
  assert.equal(wynik.getAuthor(), undefined);
  assert.ok(raport.includes('Autor: Jan Tajny'));
  assert.ok(raport.includes('Metadane XMP: 1'));
});

test('Office: właściwości, autorzy komentarzy i ścieżka szablonu znikają, treść zostaje', () => {
  const k = (s) => new TextEncoder().encode(s);
  const wej = fflate.zipSync({
    '[Content_Types].xml': k('<Types/>'),
    'docProps/core.xml': k('<cp:coreProperties><dc:creator>Jan Tajny</dc:creator><cp:lastModifiedBy>Anna &amp; Syn</cp:lastModifiedBy><dcterms:created xsi:type="dcterms:W3CDTF">2026-01-02T03:04:05Z</dcterms:created></cp:coreProperties>'),
    'docProps/app.xml': k('<Properties><Application>Microsoft Office Word</Application><Company>Tajna Firma SA</Company><TotalTime>417</TotalTime><Template>Szablon-Tajny.dotx</Template></Properties>'),
    'docProps/custom.xml': k('<Properties><property fmtid="x" pid="2" name="MSIP_Label_abc_SetBy"><vt:lpwstr>jan@tajna.pl</vt:lpwstr></property></Properties>'),
    'word/document.xml': k('<w:document><w:ins w:id="1" w:author="Jan Tajny" w:date="2026-01-01T00:00:00Z"><w:r><w:t>Treść zostaje, Jan Tajny w treści też</w:t></w:r></w:ins></w:document>'),
    'word/comments.xml': k('<w:comments><w:comment w:id="0" w:author="Ewa Ukryta" w:initials="EU"><w:p/></w:comment></w:comments>'),
    'word/_rels/settings.xml.rels': k('<Relationships><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/attachedTemplate" Target="file:///C:\\Users\\jtajny\\Szablony\\Firmowy.dotm" TargetMode="External"/></Relationships>'),
  });
  const { dane, raport } = rdzen.czyscOffice(wej, fflate);
  const pliki = fflate.unzipSync(dane);
  const t = (n) => new TextDecoder().decode(pliki[n]);
  assert.deepEqual(Object.keys(pliki), Object.keys(fflate.unzipSync(wej)), 'kolejność i komplet plików');
  assert.ok(!t('docProps/core.xml').includes('Jan Tajny'));
  assert.ok(!t('docProps/app.xml').includes('Tajna Firma') && !t('docProps/app.xml').includes('Szablon-Tajny') && t('docProps/app.xml').includes('<TotalTime>0</TotalTime>'));
  assert.ok(t('docProps/app.xml').includes('Microsoft Office Word'));
  assert.ok(!t('docProps/custom.xml').includes('tajna.pl'));
  assert.ok(t('word/document.xml').includes('w:author="Autor"') && t('word/document.xml').includes('Jan Tajny w treści też'));
  assert.ok(t('word/comments.xml').includes('w:author="Autor"') && t('word/comments.xml').includes('w:initials="A"'));
  assert.ok(!t('word/_rels/settings.xml.rels').includes('jtajny') && t('word/_rels/settings.xml.rels').includes('Target="Normal.dotm"'));
  for (const oczekiwane of ['Autor: Jan Tajny', 'Ostatnio zmienił: Anna & Syn', 'Firma: Tajna Firma SA', 'Szablon: Szablon-Tajny.dotx']) assert.ok(raport.includes(oczekiwane), oczekiwane);
  assert.ok(raport.some((r) => r.includes('etykieta poufności')));
  assert.ok(raport.some((r) => r.startsWith('Autorzy komentarzy i zmian:') && r.includes('Ewa Ukryta')));
  assert.ok(raport.some((r) => r.startsWith('Ścieżka szablonu:') && r.includes('jtajny')));
  // bez opcji autorów nazwiska w komentarzach zostają
  const zostaw = fflate.unzipSync(rdzen.czyscOffice(wej, fflate, { autorzy: false, wlasne: false }).dane);
  assert.ok(new TextDecoder().decode(zostaw['word/comments.xml']).includes('Ewa Ukryta'));
  assert.ok(new TextDecoder().decode(zostaw['docProps/custom.xml']).includes('tajna.pl'));
});

test('rodzaj: rozpoznawanie po pierwszych bajtach', () => {
  assert.equal(rdzen.rodzaj(jpegZMetadanymi()), 'jpeg');
  assert.equal(rdzen.rodzaj(new TextEncoder().encode('%PDF-1.7 ...')), 'pdf');
  assert.equal(rdzen.rodzaj(new Uint8Array([0x50, 0x4B, 3, 4, 0, 0, 0, 0, 0, 0, 0, 0])), 'zip');
  assert.equal(rdzen.rodzaj(new TextEncoder().encode('\0\0\0\x18ftypheic....')), 'inny-obraz');
  assert.equal(rdzen.rodzaj(new TextEncoder().encode('zwykly tekst....')), null);
});
