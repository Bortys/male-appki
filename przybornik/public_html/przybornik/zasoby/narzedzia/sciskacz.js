// § 01 Ściskacz · zdjęcia do zadanego rozmiaru pliku. Obróbka na serwerze (Imagick),
// bo tam czyta się HEIC i dobiera jakość z dokładnością do jednego punktu.
import { el, pole, lista, zetony, strefa, postep, listaWynikow, przedPo, api, opisBledu } from '../wspolne.js';

export async function start(korzen) {
  const limit = el('input', { type: 'number', min: 10, max: 100000, step: 10, value: 500 });
  const szybkie = zetony([[200, '200 KB'], [500, '500 KB'], [1024, '1 MB'], [2048, '2 MB'], [5120, '5 MB']], 500);
  szybkie.addEventListener('zmiana', () => { limit.value = szybkie.wartosc; });
  limit.addEventListener('input', () => szybkie.ustaw(limit.value));

  const bok = lista([[0, 'bez zmian'], [4000, '4000 px'], [2560, '2560 px'], [1920, '1920 px'], [1280, '1280 px']], 0);
  const format = lista([['jpg', 'JPG'], ['webp', 'WebP (mniejszy przy tej samej jakości)']], 'jpg');

  const stan = postep();
  const wyniki = listaWynikow({ nazwaZip: 'zdjecia-scisniete.zip' });

  async function przerob(pliki) {
    let nr = 0;
    for (const plik of pliki) {
      nr++;
      stan.ustaw(`Ściskam ${nr} z ${pliki.length}: ${plik.name}`, (nr - 1) / pliki.length);
      try {
        const { blob, info } = await api('sciskaj', { plik, limit_kb: limit.value || 500, maks_bok: bok.value, format: format.value });
        const wymiary = `${info.szer}×${info.wys} px`;
        const uwagi = [];
        if (info.zmniejszono) uwagi.push(`Sama jakość nie wystarczyła, zmniejszyłem wymiary z ${info.szer_przed}×${info.wys_przed} px.`);
        wyniki.dodaj({
          nazwa: info.nazwa || plik.name,
          opis: [...przedPo(plik.size, blob.size), ` · ${wymiary} · jakość ${info.jakosc}`],
          blob, miniatura: blob, szczegoly: uwagi,
        });
      } catch (e) {
        wyniki.dodaj({ nazwa: plik.name, opis: opisBledu(e), blad: true });
      }
    }
    stan.ukryj();
  }

  korzen.append(
    el('div', { class: 'opcje' },
      pole('Plik nie większy niż (KB)', el('div', {}, limit, el('div', { class: 'rzad' }, szybkie))),
      pole('Dłuższy bok najwyżej', bok),
      pole('Format wyniku', format)),
    strefa({
      tytul: 'Upuść zdjęcia albo kliknij, żeby wybrać',
      opis: 'JPG, PNG, HEIC, WebP, AVIF, TIFF. Metadane (GPS, model aparatu) znikają, profil kolorów zostaje.',
      accept: 'image/*,.heic,.heif,.avif', wiele: true, naPliki: przerob,
    }),
    stan.el, wyniki.el);
}
