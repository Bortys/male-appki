// MP4 do MP3 · wyciąga dźwięk z filmu do pliku MP3, kilka plików naraz.
// Dźwięk dekoduje przeglądarka (WebCodecs), a MP3 koduje LAME jako WebAssembly (dodatek do Mediabunny),
// bo przeglądarki nie mają własnego kodera MP3. Plik nie opuszcza komputera.
import { el, pole, zetony, strefa, postep, listaWynikow, rozmiar, bezRozszerzenia, rozszerzenie, LIB, opisBledu } from '../wspolne.js';

export const JAKOSCI = [
  [128, '128 kb/s', 'mowa, wykład, podcast; najmniejszy plik'],
  [192, '192 kb/s', 'dobra jakość do wszystkiego'],
  [320, '320 kb/s', 'muzyka; największy plik'],
];

/** „Wykład.mov” → „Wykład.mp3”. Z pliku, który już jest MP3, robi „Nagranie-128kbps.mp3”, żeby nie nadpisać nazwy. */
export function nazwaMp3(nazwa, kbps) {
  const baza = bezRozszerzenia(nazwa).trim() || 'dzwiek';
  return rozszerzenie(nazwa) === 'mp3' ? `${baza}-${kbps}kbps.mp3` : `${baza}.mp3`;
}

/** Sekundy jako „0:07”, „12:05” albo „1:02:03”. */
export function czas(sekundy) {
  const c = Math.max(0, Math.round(sekundy || 0));
  const g = Math.floor(c / 3600), m = Math.floor((c % 3600) / 60), s = String(c % 60).padStart(2, '0');
  return g ? `${g}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}

export async function start(korzen) {
  const mb = await import(`${LIB}mediabunny/mediabunny.min.mjs`);
  if (!(await mb.canEncodeAudio('mp3'))) {
    // Koder ładuje się z adresu ../mediabunny/mediabunny.min.mjs, czyli z tego samego modułu co wyżej.
    const { registerMp3Encoder } = await import(`${LIB}mp3/mediabunny-mp3-encoder.min.mjs`);
    registerMp3Encoder();
  }

  const jakosc = zetony(JAKOSCI.map(([k, etykieta]) => [k, etykieta]), 192);
  const opisJakosci = el('span', { class: 'wartosc' });
  const pokazOpis = () => { opisJakosci.textContent = JAKOSCI.find(([k]) => k === Number(jakosc.wartosc))?.[2] || ''; };
  jakosc.addEventListener('zmiana', pokazOpis);
  pokazOpis();

  const anuluj = el('button', { type: 'button', class: 'link', text: 'Przerwij', hidden: true });
  const stan = postep();
  const wyniki = listaWynikow({ nazwaZip: 'mp3.zip' });

  const kolejka = [];
  let pracuje = false;
  let przerwano = false;
  let konwersja = null;

  async function przerob(plik, nr, ile) {
    const kbps = Number(jakosc.wartosc);
    const prefiks = ile > 1 ? `Plik ${nr} z ${ile} · ` : '';
    stan.ustaw(`${prefiks}Czytam ${plik.name}`, (nr - 1) / ile);
    const wejscie = new mb.Input({ source: new mb.BlobSource(plik), formats: mb.ALL_FORMATS });
    try {
      let sciezka;
      try {
        sciezka = await wejscie.getPrimaryAudioTrack();
      } catch (e) {
        if (/unsupported|unrecogni[sz]ed|not a valid/i.test(`${e?.name} ${e?.message}`)) {
          throw new Error('Nie rozpoznaję tego pliku. Działa z MP4, MOV, M4A, WebM, MKV, WAV i podobnymi.');
        }
        throw e;
      }
      if (!sciezka) throw new Error('W tym pliku nie ma ścieżki dźwiękowej.');
      if (!(await sciezka.canDecode())) {
        throw new Error(`Ta przeglądarka nie odczyta dźwięku z tego pliku (kodek ${sciezka.codec || 'nieznany'}). Spróbuj w aktualnym Chrome albo Edge.`);
      }
      const dlugosc = await wejscie.computeDuration();

      const wyjscie = new mb.Output({ format: new mb.Mp3OutputFormat(), target: new mb.BufferTarget() });
      konwersja = await mb.Conversion.init({
        input: wejscie, output: wyjscie, tracks: 'primary',
        video: { discard: true },
        audio: { codec: 'mp3', quality: new mb.Quality({ bitrate: kbps * 1000 }), forceTranscode: true },
        showWarnings: false,
      });
      if (!konwersja.isValid) {
        const powody = konwersja.discardedTracks.filter((d) => d.track?.type === 'audio').map((d) => d.reason).join(', ');
        throw new Error(`Nie da się zamienić dźwięku z tego pliku na MP3 (${powody || 'brak obsługiwanej ścieżki'}).`);
      }
      const t0 = performance.now();
      konwersja.onProgress = (ulamek) => stan.ustaw(`${prefiks}${plik.name}: ${Math.round(ulamek * 100)}%`, (nr - 1 + ulamek) / ile);
      await konwersja.execute();

      const blob = new Blob([wyjscie.target.buffer], { type: 'audio/mpeg' });
      const sekundyPracy = (performance.now() - t0) / 1000;
      wyniki.dodaj({
        nazwa: nazwaMp3(plik.name, kbps),
        opis: `${czas(dlugosc)} · ${kbps} kb/s · ${rozmiar(blob.size)} · praca ${sekundyPracy < 10 ? sekundyPracy.toFixed(1).replace('.', ',') : Math.round(sekundyPracy)} s`,
        blob,
      });
    } finally {
      wejscie.dispose();
      konwersja = null;
    }
  }

  async function dodaj(pliki) {
    kolejka.push(...pliki);
    if (pracuje) return;              // pliki dorzucone w trakcie pracy czekają w kolejce
    pracuje = true;
    przerwano = false;
    anuluj.hidden = false;
    let zrobione = 0;
    while (kolejka.length && !przerwano) {
      const plik = kolejka.shift();
      try {
        await przerob(plik, zrobione + 1, zrobione + 1 + kolejka.length);
      } catch (e) {
        if (e?.name === 'ConversionCanceledError' || /cancel/i.test(String(e?.message))) przerwano = true;
        else { console.error(e); wyniki.dodaj({ nazwa: plik.name, opis: opisBledu(e), blad: true }); }
      }
      zrobione++;
    }
    kolejka.length = 0;
    pracuje = false;
    anuluj.hidden = true;
    if (przerwano) stan.ustaw('Przerwano.', 0); else stan.ukryj();
  }

  anuluj.addEventListener('click', () => { przerwano = true; konwersja?.cancel(); });

  korzen.append(
    el('div', { class: 'opcje' },
      pole('Jakość MP3', el('div', {}, jakosc, el('div', { class: 'rzad' }, opisJakosci)), { szerokie: true })),
    strefa({
      tytul: 'Upuść filmy albo kliknij, żeby wybrać',
      opis: 'MP4, MOV, M4A, WebM, MKV, WAV. Można kilka naraz. Z każdego powstaje MP3 z samym dźwiękiem; plik nie trafia na serwer.',
      accept: 'video/*,audio/*,.mp4,.m4v,.mov,.mkv,.webm,.m4a,.wav,.aac,.flac,.ogg,.opus,.mp3',
      wiele: true, naPliki: dodaj,
    }),
    stan.el, el('div', { class: 'akcje' }, anuluj), wyniki.el);
}
