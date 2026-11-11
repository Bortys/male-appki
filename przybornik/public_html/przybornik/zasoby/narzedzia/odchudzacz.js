// § 04 Odchudzacz PDF · Ghostscript jako WebAssembly, w robotniku. Tekst zostaje tekstem,
// zmniejszane są obrazy, a czcionki tracą nieużywane znaki.
import { el, pole, zetony, strefa, postep, listaWynikow, przedPo, bezRozszerzenia, opisBledu } from '../wspolne.js';

// Progi 1.0: obraz jest zmniejszany, gdy tylko przekracza rozdzielczość poziomu. Domyślny próg
// Ghostscripta (1,5) zostawiał bez zmian np. zdjęcie 205 dpi na poziomie 150 dpi.
const WSPOLNE = ['-sDEVICE=pdfwrite', '-dCompatibilityLevel=1.5', '-dNOPAUSE', '-dBATCH', '-dDetectDuplicateImages=true', '-dAutoRotatePages=/None',
  '-dColorImageDownsampleThreshold=1.0', '-dGrayImageDownsampleThreshold=1.0', '-dMonoImageDownsampleThreshold=1.0'];
export const POZIOMY = {
  mail: { nazwa: 'Mail', opis: 'Najmniejszy plik. Obrazy 110 dpi i zapisane od nowa: dobrze wygląda na ekranie, słabiej w druku.', argumenty: ['-dPDFSETTINGS=/screen', '-dColorImageResolution=110', '-dGrayImageResolution=110', '-dMonoImageResolution=300', '-dPassThroughJPEGImages=false'] },
  ekran: { nazwa: 'Ekran', opis: 'Obrazy 150 dpi. Rozsądny środek do czytania i wysyłania.', argumenty: ['-dPDFSETTINGS=/ebook'] },
  druk: { nazwa: 'Druk', opis: 'Obrazy 300 dpi. Do wydruku, plik maleje najmniej.', argumenty: ['-dPDFSETTINGS=/printer'] },
};

let robotnik = null;
let nastepne = 1;
const oczekujace = new Map();

function wezRobotnika() {
  if (robotnik) return robotnik;
  robotnik = new Worker(new URL('../robotnicy/gs-robotnik.js', import.meta.url));
  robotnik.onmessage = ({ data }) => {
    const zadanie = oczekujace.get(data.id);
    if (!zadanie) return;
    if (data.typ === 'log') zadanie.log?.(data.linia);
    else if (data.typ === 'gotowe') { oczekujace.delete(data.id); zadanie.ok(data.bajty); }
    else { oczekujace.delete(data.id); zadanie.zle(new Error(data.komunikat)); }
  };
  robotnik.onerror = (z) => {
    for (const [, zadanie] of oczekujace) zadanie.zle(new Error(z.message || 'Robotnik Ghostscripta przestał działać.'));
    oczekujace.clear();
    robotnik.terminate();
    robotnik = null;
  };
  return robotnik;
}

/** Uruchamia Ghostscripta na bajtach PDF. naPostep(ulamek) woła się po każdej stronie. */
export function odchudz(bajty, poziom, naPostep = null) {
  return new Promise((ok, zle) => {
    const id = nastepne++;
    let stron = 0;
    oczekujace.set(id, {
      ok, zle,
      log(linia) {
        const m = /^Processing pages \d+ through (\d+)/.exec(linia);
        if (m) stron = Number(m[1]);
        const s = /^Page (\d+)/.exec(linia);
        if (s && stron && naPostep) naPostep(Number(s[1]) / stron, Number(s[1]), stron);
      },
    });
    wezRobotnika().postMessage({ id, bajty, argumenty: [...WSPOLNE, ...POZIOMY[poziom].argumenty] }, [bajty.buffer]);
  });
}

export async function start(korzen) {
  const poziom = zetony(Object.entries(POZIOMY).map(([k, p]) => [k, p.nazwa]), 'ekran');
  const opisPoziomu = el('span', { class: 'wartosc', text: POZIOMY.ekran.opis });
  poziom.addEventListener('zmiana', () => { opisPoziomu.textContent = POZIOMY[poziom.wartosc].opis; });
  const stan = postep();
  const wyniki = listaWynikow({ nazwaZip: 'pdf-odchudzone.zip' });

  async function przerob(pliki) {
    let nr = 0;
    for (const plik of pliki) {
      nr++;
      const etykieta = `Odchudzam ${nr} z ${pliki.length}: ${plik.name}`;
      stan.ustaw(`${etykieta} (uruchamiam Ghostscripta)`, (nr - 1) / pliki.length);
      try {
        const wej = new Uint8Array(await plik.arrayBuffer());
        if (String.fromCharCode(...wej.subarray(0, 5)) !== '%PDF-') throw new Error('To nie jest plik PDF.');
        const wynik = await odchudz(wej, poziom.wartosc, (u, strona, stron) => stan.ustaw(`${etykieta} (strona ${strona} z ${stron})`, (nr - 1 + u) / pliki.length));
        const blob = new Blob([wynik], { type: 'application/pdf' });
        const wiekszy = blob.size >= plik.size;
        wyniki.dodaj({
          nazwa: `${bezRozszerzenia(plik.name)}-${poziom.wartosc}.pdf`,
          opis: przedPo(plik.size, blob.size),
          blob: wiekszy ? null : blob,
          szczegoly: wiekszy ? ['Ten plik był już dobrze skompresowany. Zostań przy oryginale albo wybierz niższy poziom.'] : null,
        });
      } catch (e) {
        wyniki.dodaj({ nazwa: plik.name, opis: opisBledu(e), blad: true });
      }
    }
    stan.ukryj();
  }

  korzen.append(
    el('div', { class: 'opcje' }, pole('Poziom', el('div', {}, poziom, opisPoziomu), { szerokie: true })),
    strefa({ tytul: 'Upuść pliki PDF albo kliknij, żeby wybrać', opis: 'Plik nie opuszcza przeglądarki. Przy pierwszym użyciu wczytuje się Ghostscript (16 MB).', accept: 'application/pdf,.pdf', wiele: true, naPliki: przerob }),
    stan.el, wyniki.el);
}
