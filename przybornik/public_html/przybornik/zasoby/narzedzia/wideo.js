// § 08 Pion do sociali · film w formacie kanału, przycięty, w limicie rozmiaru, z wypalonymi napisami.
// Koduje przeglądarka (WebCodecs, sprzętowo) przez bibliotekę Mediabunny, więc minuta filmu
// to kilka do kilkunastu sekund pracy, a plik nie opuszcza komputera.
import { el, pole, lista, strefa, postep, listaWynikow, przedPo, rozmiar, odmiana, nowePlotno, bezRozszerzenia, LIB, opisBledu } from '../wspolne.js';

const FORMATY = [
  ['1080x1920', 'pion 9:16 · Reels, TikTok, Shorts'],
  ['1080x1350', 'pion 4:5 · Instagram, LinkedIn'],
  ['1080x1080', 'kwadrat 1:1'],
  ['1920x1080', 'poziom 16:9 · YouTube'],
  ['bez', 'bez zmiany kadru'],
];
const DZWIEK = 128000;

/** Napisy SRT albo VTT → [{od, do, tekst}] (sekundy). */
export function czytajNapisy(tresc) {
  const czas = (g, m, s, ms) => Number(g || 0) * 3600 + Number(m) * 60 + Number(s) + Number(ms.padEnd(3, '0')) / 1000;
  const wzor = /(?:(\d+):)?(\d{1,2}):(\d{2})[,.](\d{1,3})\s*-->\s*(?:(\d+):)?(\d{1,2}):(\d{2})[,.](\d{1,3})[^\n]*\n([\s\S]*?)(?=\n\s*\n|$)/g;
  const napisy = [];
  for (const m of tresc.replace(/\r/g, '').replace(/^﻿/, '').matchAll(wzor)) {
    const tekst = m[9].replace(/<[^>]+>/g, '').replace(/\{[^}]+\}/g, '').trim();
    if (tekst) napisy.push({ od: czas(m[1], m[2], m[3], m[4]), do: czas(m[5], m[6], m[7], m[8]), tekst });
  }
  return napisy.sort((a, b) => a.od - b.od);
}

/** Łamie tekst na wiersze, które mieszczą się w szerokości. */
export function lamTekst(kontekst, tekst, szerokosc) {
  const wiersze = [];
  for (const akapit of tekst.split('\n')) {
    let biezacy = '';
    for (const slowo of akapit.split(/\s+/).filter(Boolean)) {
      const proba = biezacy ? `${biezacy} ${slowo}` : slowo;
      if (biezacy && kontekst.measureText(proba).width > szerokosc) { wiersze.push(biezacy); biezacy = slowo; } else { biezacy = proba; }
    }
    if (biezacy) wiersze.push(biezacy);
  }
  return wiersze;
}

/** Rysuje napis u dołu kadru: jasny tekst z ciemnym obrysem, czytelny na każdym tle. */
export function rysujNapis(kontekst, tekst, W, H) {
  const kroj = Math.round(Math.min(W, H) * 0.052);
  kontekst.font = `700 ${kroj}px "BS Sans", Carlito, Calibri, Arial, sans-serif`;
  kontekst.textAlign = 'center';
  kontekst.textBaseline = 'alphabetic';
  kontekst.lineJoin = 'round';
  const wiersze = lamTekst(kontekst, tekst, W * 0.86);
  const interlinia = kroj * 1.22;
  let y = H * 0.86 - (wiersze.length - 1) * interlinia;
  for (const wiersz of wiersze) {
    kontekst.lineWidth = kroj * 0.22;
    kontekst.strokeStyle = '#161310';
    kontekst.strokeText(wiersz, W / 2, y);
    kontekst.fillStyle = '#FCFAF5';
    kontekst.fillText(wiersz, W / 2, y);
    y += interlinia;
  }
}

const sekundy = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

export async function start(korzen) {
  const mb = await import(`${LIB}mediabunny/mediabunny.min.mjs`);
  let plik = null;
  let dane = null;         // {czas, szer, wys}
  let napisy = [];

  const film = el('video', { controls: true, playsInline: true, preload: 'metadata' });
  const podglad = el('div', { class: 'podglad' }, film);
  const opisFilmu = el('p', { class: 'podpis' });
  const format = lista(FORMATY, '1080x1920');
  const tryb = lista([['cover', 'wypełnij kadr, przytnij boki'], ['contain', 'zmieść całość, dodaj pasy']], 'cover');
  const od = el('input', { type: 'number', min: 0, step: 0.1, value: 0 });
  const doKonca = el('input', { type: 'number', min: 0, step: 0.1, value: 0 });
  const limit = lista([[0, 'bez limitu, wysoka jakość'], [25, '25 MB'], [50, '50 MB'], [100, '100 MB'], [250, '250 MB'], [500, '500 MB']], 0);
  const plikNapisow = el('input', { type: 'file', accept: '.srt,.vtt,text/vtt,application/x-subrip', hidden: true });
  const opisNapisow = el('span', { class: 'wartosc', text: 'brak' });
  const przycisk = el('button', { type: 'button', class: 'przycisk', text: 'Przerób film', disabled: true });
  const anuluj = el('button', { type: 'button', class: 'link', text: 'Przerwij', hidden: true });
  const stan = postep();
  const wyniki = listaWynikow({ nazwaZip: 'filmy.zip' });
  const robocze = el('div', { hidden: true });
  let konwersja = null;

  const zOdtwarzacza = (cel) => el('button', { type: 'button', class: 'zeton', text: 'z odtwarzacza', title: 'Wstaw bieżącą pozycję odtwarzacza', onclick: () => { cel.value = film.currentTime.toFixed(1); } });

  plikNapisow.addEventListener('change', async () => {
    const p = plikNapisow.files[0];
    napisy = p ? czytajNapisy(await p.text()) : [];
    opisNapisow.textContent = p ? (napisy.length ? `${p.name}: ${odmiana(napisy.length, 'napis', 'napisy', 'napisów')}` : `${p.name}: nie znalazłem napisów`) : 'brak';
  });

  async function wczytaj([nowy]) {
    stan.ustaw(`Czytam film: ${nowy.name}`);
    przycisk.disabled = true;
    try {
      const wejscie = new mb.Input({ source: new mb.BlobSource(nowy), formats: mb.ALL_FORMATS });
      const sciezka = await wejscie.getPrimaryVideoTrack();
      if (!sciezka) throw new Error('W tym pliku nie ma obrazu wideo.');
      if (!(await sciezka.canDecode())) throw new Error(`Ta przeglądarka nie odczyta kodeka tego filmu (${sciezka.codec || 'nieznany'}).`);
      dane = { czas: await wejscie.computeDuration(), szer: sciezka.displayWidth, wys: sciezka.displayHeight };
      wejscie.dispose();
      plik = nowy;
      if (film.src) URL.revokeObjectURL(film.src);
      film.src = URL.createObjectURL(nowy);
      od.value = 0; doKonca.value = dane.czas.toFixed(1);
      od.max = doKonca.max = dane.czas.toFixed(1);
      opisFilmu.textContent = `${dane.szer}×${dane.wys} px · ${sekundy(dane.czas)} · ${rozmiar(nowy.size)}`;
      robocze.hidden = false;
      przycisk.disabled = false;
      stan.ukryj();
    } catch (e) {
      stan.blad(opisBledu(e));
    }
  }

  przycisk.addEventListener('click', async () => {
    const start = Math.max(0, Number(od.value) || 0);
    const koniec = Math.min(dane.czas, Number(doKonca.value) || dane.czas);
    if (koniec - start < 0.2) { stan.blad('Koniec musi być później niż początek.'); return; }
    const [W, H] = format.value === 'bez' ? [dane.szer - (dane.szer % 2), dane.wys - (dane.wys % 2)] : format.value.split('x').map(Number);
    const dlugosc = koniec - start;
    const limitBajtow = Number(limit.value) * 1024 * 1024;

    przycisk.disabled = true;
    anuluj.hidden = false;
    stan.ustaw('Sprawdzam, czy przeglądarka zakoduje film…');
    let wejscie = null;
    try {
      if (!(await mb.canEncodeVideo('avc', { width: W, height: H }))) throw new Error('Ta przeglądarka nie koduje wideo H.264. Użyj aktualnego Chrome, Edge albo Safari.');
      const dzwiekAac = await mb.canEncodeAudio('aac');
      const bitrate = limitBajtow ? Math.max(250000, Math.floor(limitBajtow * 8 * 0.96 / dlugosc) - DZWIEK) : null;

      const wideo = {
        width: W, height: H, fit: tryb.value, codec: 'avc', forceTranscode: true,
        quality: new mb.Quality(bitrate ? { bitrate } : 'high'),
      };
      if (napisy.length) {
        await document.fonts.load('700 48px "BS Sans"').catch(() => {});
        const plotno = nowePlotno(W, H);
        const k = plotno.getContext('2d');
        let przesuniecie = null;      // różnica między czasem klatki a czasem w pliku źródłowym
        wideo.process = (klatka) => {
          // Po przycięciu oś czasu wyniku zaczyna się od zera, a napisy liczą czas od początku oryginału
          if (przesuniecie === null) przesuniecie = klatka.timestamp < start - 0.02 ? start : 0;
          const t = klatka.timestamp + przesuniecie;
          const napis = napisy.find((n) => t >= n.od && t < n.do);
          if (!napis) return klatka;
          k.clearRect(0, 0, W, H);
          klatka.draw(k, 0, 0, W, H);
          rysujNapis(k, napis.tekst, W, H);
          return plotno;
        };
        wideo.processedWidth = W;
        wideo.processedHeight = H;
      }

      wejscie = new mb.Input({ source: new mb.BlobSource(plik), formats: mb.ALL_FORMATS });
      const wyjscie = new mb.Output({ format: new mb.Mp4OutputFormat({ fastStart: 'in-memory' }), target: new mb.BufferTarget() });
      konwersja = await mb.Conversion.init({
        input: wejscie, output: wyjscie, tracks: 'primary',
        video: wideo,
        audio: dzwiekAac ? { codec: 'aac', quality: new mb.Quality({ bitrate: DZWIEK }) } : {},
        trim: { start, end: koniec },
        showWarnings: false,
      });
      if (!konwersja.isValid) {
        const powody = konwersja.discardedTracks.map((d) => d.reason).join(', ');
        throw new Error(`Nie da się przerobić tego filmu (${powody || 'brak obsługiwanej ścieżki'}).`);
      }
      const t0 = performance.now();
      konwersja.onProgress = (ulamek) => stan.ustaw(`Koduję film: ${Math.round(ulamek * 100)}%`, ulamek);
      await konwersja.execute();
      const blob = new Blob([wyjscie.target.buffer], { type: 'video/mp4' });
      const bezDzwieku = konwersja.discardedTracks.some((d) => d.track?.type === 'audio');
      const uwagi = [];
      if (bezDzwieku) uwagi.push('Ścieżka dźwiękowa nie przeszła, film jest niemy.');
      if (limitBajtow && blob.size > limitBajtow) uwagi.push('Plik wyszedł trochę większy niż limit. Skróć film albo wybierz mniejszy format.');
      wyniki.dodaj({
        nazwa: `${bezRozszerzenia(plik.name)}-${format.value === 'bez' ? 'przerobiony' : format.value}.mp4`,
        opis: [...przedPo(plik.size, blob.size), ` · ${W}×${H} px · ${sekundy(dlugosc)} · praca ${Math.round((performance.now() - t0) / 1000)} s`],
        blob, szczegoly: uwagi,
      });
      stan.ukryj();
    } catch (e) {
      if (e?.name === 'ConversionCanceledError' || /cancel/i.test(String(e?.message))) stan.ustaw('Przerwano.', 0);
      else { console.error(e); stan.blad(opisBledu(e)); }
    } finally {
      wejscie?.dispose();
      konwersja = null;
      przycisk.disabled = false;
      anuluj.hidden = true;
    }
  });
  anuluj.addEventListener('click', () => konwersja?.cancel());

  robocze.append(
    el('div', { class: 'dwie-kolumny' },
      el('div', {}, podglad, opisFilmu),
      el('div', { class: 'opcje ciasne' },
        pole('Format', format, { szerokie: true }),
        pole('Dopasowanie', tryb, { szerokie: true }),
        pole('Początek (s)', el('div', {}, od, el('div', { class: 'rzad' }, zOdtwarzacza(od)))),
        pole('Koniec (s)', el('div', {}, doKonca, el('div', { class: 'rzad' }, zOdtwarzacza(doKonca)))),
        pole('Limit rozmiaru', limit, { szerokie: true }),
        pole('Napisy do wypalenia (SRT, VTT)', el('div', { class: 'rzad' },
          el('button', { type: 'button', class: 'zeton', text: 'wybierz plik', onclick: () => plikNapisow.click() }),
          el('button', { type: 'button', class: 'zeton', text: 'usuń', onclick: () => { plikNapisow.value = ''; napisy = []; opisNapisow.textContent = 'brak'; } }),
          plikNapisow, opisNapisow), { szerokie: true }))),
    el('div', { class: 'akcje' }, przycisk, anuluj));

  korzen.append(
    strefa({ tytul: 'Upuść film albo kliknij, żeby wybrać', opis: 'MP4, MOV, WebM, MKV. Wynik to MP4 (H.264 i AAC), który przyjmuje każdy kanał.', accept: 'video/*,.mp4,.mov,.mkv,.webm', naPliki: wczytaj }),
    stan.el, robocze, wyniki.el);
}
