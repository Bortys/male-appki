// Testy czystych funkcji z narzędzi przeglądarkowych (bez DOM). Uruchomienie: node --test tests/js/*.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import vm from 'node:vm';

globalThis.document = { querySelector: () => null };        // wspolne.js czyta żeton z <meta>
const APP = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../public_html/przybornik');
const modul = (nazwa) => import(path.join(APP, 'zasoby', nazwa));
const wspolne = await modul('wspolne.js');

test('odmiana i rozmiar po polsku', () => {
  const o = (n) => wspolne.odmiana(n, 'strona', 'strony', 'stron');
  assert.deepEqual([1, 2, 4, 5, 11, 12, 14, 21, 22, 25, 102, 112].map(o),
    ['1 strona', '2 strony', '4 strony', '5 stron', '11 stron', '12 stron', '14 stron', '21 stron', '22 strony', '25 stron', '102 strony', '112 stron']);
  assert.equal(wspolne.rozmiar(900), '900 B');
  assert.equal(wspolne.rozmiar(1536).replace(/\s/g, ' '), '1,5 KB');
  assert.equal(wspolne.rozmiar(5 * 1024 * 1024).replace(/\s/g, ' '), '5 MB');
  assert.equal(wspolne.bezRozszerzenia('Raport v1.2.pdf'), 'Raport v1.2');
  assert.equal(wspolne.rozszerzenie('IMG_1.HEIC'), 'heic');
});

test('Kadrownik: kadr trzyma proporcje, nie wychodzi poza zdjęcie i idzie za punktem', async () => {
  const { prostokatKadru, FORMATY } = await modul('narzedzia/kadrownik.js');
  for (const f of FORMATY) {
    for (const [W, H] of [[3000, 2000], [2000, 3000], [1000, 1000]]) {
      for (const [fx, fy, zoom] of [[0.5, 0.5, 1], [0, 0, 1], [1, 1, 2.5], [0.2, 0.9, 1.3]]) {
        const [x, y, w, h] = prostokatKadru(W, H, f.w, f.h, fx, fy, zoom);
        assert.ok(x >= 0 && y >= 0 && x + w <= W + 1e-6 && y + h <= H + 1e-6, `${f.id} poza zdjęciem`);
        assert.ok(Math.abs(w / h - f.w / f.h) < 1e-9, `${f.id} proporcje`);
      }
    }
  }
  assert.deepEqual(prostokatKadru(3000, 2000, 1080, 1080, 0, 0.5, 1), [0, 0, 2000, 2000]);
  assert.deepEqual(prostokatKadru(3000, 2000, 1080, 1080, 1, 0.5, 1), [1000, 0, 2000, 2000]);
  assert.deepEqual(prostokatKadru(3000, 2000, 1080, 1080, 0.5, 0.5, 2), [1000, 500, 1000, 1000]);
});

test('Ładny zrzut: układ grafiki', async () => {
  const { uklad } = await modul('narzedzia/zrzut.js');
  assert.deepEqual(uklad(1000, 500, 'auto', 10), { W: 1200, H: 700, x: 100, y: 100, w: 1000, h: 500, margines: 100 });
  const u = uklad(2000, 1000, '1080x1350', 10);
  assert.deepEqual([u.W, u.H, u.w, u.h, u.x, u.y], [1080, 1350, 864, 432, 108, 459]);
  assert.equal(uklad(100, 100, '1080x1080', 0).w, 200, 'mały zrzut powiększany najwyżej dwukrotnie');
});

test('Karuzela: dopasowanie strony', async () => {
  const { dopasuj } = await modul('narzedzia/karuzela.js');
  assert.deepEqual(dopasuj(1920, 1080, 1080, 1350, 'zmiesc'), { x: 0, y: 371.25, w: 1080, h: 607.5, skala: 0.5625 });
  const w = dopasuj(1920, 1080, 1080, 1350, 'wypelnij');
  assert.deepEqual([w.h, w.y, Math.round(w.w), Math.round(w.x)], [1350, 0, 2400, -660]);
});

test('Wideo: napisy SRT i VTT, łamanie wierszy', async () => {
  const { czytajNapisy, lamTekst } = await modul('narzedzia/wideo.js');
  const srt = '﻿1\r\n00:00:01,500 --> 00:00:03,000\r\n<i>Zażółć</i> gęślą\r\njaźń\r\n\r\n2\r\n01:02:03,004 --> 01:02:05,000\r\n{\\an8}Drugi\r\n\r\n3\r\n00:00:09,000 --> 00:00:10,000\r\n\r\n';
  assert.deepEqual(czytajNapisy(srt), [
    { od: 1.5, do: 3, tekst: 'Zażółć gęślą\njaźń' },
    { od: 3723.004, do: 3725, tekst: 'Drugi' },
  ]);
  const vtt = 'WEBVTT\n\n00:01.000 --> 00:02.500 align:center\nKrótki format\n\nNOTE komentarz\n\n00:00:05.5 --> 00:00:06.25\nUłamki';
  assert.deepEqual(czytajNapisy(vtt), [{ od: 1, do: 2.5, tekst: 'Krótki format' }, { od: 5.5, do: 6.25, tekst: 'Ułamki' }]);
  const kontekst = { measureText: (t) => ({ width: t.length * 10 }) };
  assert.deepEqual(lamTekst(kontekst, 'raz dwa trzy cztery\npięć', 80), ['raz dwa', 'trzy', 'cztery', 'pięć']);
});

test('MP4 do MP3: nazwy plików i czas', async () => {
  const { nazwaMp3, czas, JAKOSCI } = await modul('narzedzia/mp3.js');
  assert.equal(nazwaMp3('Wykład 3.mov', 192), 'Wykład 3.mp3');
  assert.equal(nazwaMp3('film.v2.MP4', 128), 'film.v2.mp3');
  assert.equal(nazwaMp3('Nagranie.MP3', 128), 'Nagranie-128kbps.mp3');
  assert.equal(nazwaMp3('.mp4', 192), 'dzwiek.mp3');
  assert.deepEqual([0, 7.4, 59.6, 725, 3723, NaN].map(czas), ['0:00', '0:07', '1:00', '12:05', '1:02:03', '0:00']);
  assert.deepEqual(JAKOSCI.map(([k]) => k), [128, 192, 320]);
});

test('QR: macierz i SVG', async () => {
  const { macierz, naSvg } = await modul('narzedzia/qr.js');
  const piaskownica = {};
  vm.runInNewContext(fs.readFileSync(path.join(APP, 'lib/qrcode/qrcode.js'), 'utf8') + '\nthis.qrcode = qrcode;', piaskownica);
  const m = macierz(piaskownica.qrcode, 'https://sokolinski.com/zażółć', 'H');
  assert.equal(m.length, m[0].length);
  assert.ok(m.length >= 29, 'korekcja H wymusza większy kod');
  // trzy znaczniki narożne: lewy górny, prawy górny, lewy dolny
  for (const [w, k] of [[0, 0], [0, m.length - 7], [m.length - 7, 0]]) {
    assert.ok(m[w].slice(k, k + 7).every(Boolean) && m[w + 6].slice(k, k + 7).every(Boolean) && !m[w + 1][k + 1]);
  }
  assert.ok(macierz(piaskownica.qrcode, 'https://sokolinski.com/zażółć', 'M').length < m.length);
  const svg = naSvg(m, { rozmiar: 512, margines: 4, kolor: '#701828', tlo: '#FFFFFF', logo: 'data:image/png;base64,AAAA' });
  assert.match(svg, new RegExp(`^<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${m.length + 8} ${m.length + 8}" width="512" height="512"`));
  assert.ok(svg.includes('<path fill="#701828" d="M4 4h7v1h-7z') && svg.includes('<image href="data:image/png;base64,AAAA"') && svg.endsWith('</svg>'));
  assert.ok(!naSvg(m, { rozmiar: 512, margines: 4, kolor: '#161310', tlo: 'przezroczyste' }).includes('<rect'));
  assert.throws(() => macierz(piaskownica.qrcode, 'x'.repeat(5000), 'H'));
});

test('Odchudzacz: poziomy mają komplet argumentów Ghostscripta', async () => {
  globalThis.Worker = class {};
  const { POZIOMY } = await modul('narzedzia/odchudzacz.js');
  assert.deepEqual(Object.keys(POZIOMY), ['mail', 'ekran', 'druk']);
  for (const p of Object.values(POZIOMY)) assert.ok(p.argumenty[0].startsWith('-dPDFSETTINGS=/') && p.opis.length > 20);
});
