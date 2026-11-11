// § 06 Karuzela · PDF albo grafiki jako strony o stałych wymiarach: dokument na LinkedIn (PDF)
// albo obrazy do karuzeli na Instagramie (ZIP). Strony z PDF-a trafiają do nowego PDF-a jako
// wektor, więc tekst zostaje ostry i plik mały; obrazy rysuje pdf.js.
import { el, pole, lista, zetony, strefa, postep, pobierz, zip, naBitmape, naBlob, nowePlotno, rozmiar, bezRozszerzenia, KOLORY, opisBledu } from '../wspolne.js';
import { otworzPdf, rysujStrone, wezPdfLib } from '../pdf.js';

const FORMATY = [
  ['1080x1350', 'pion 4:5 · 1080×1350'],
  ['1080x1080', 'kwadrat 1:1 · 1080×1080'],
  ['1080x1920', 'pion 9:16 · 1080×1920'],
  ['1920x1080', 'poziom 16:9 · 1920×1080'],
];

/** Gdzie na stronie W×H wyląduje treść o wymiarach w×h: {x, y, w, h} (lewy górny róg). */
export function dopasuj(w, h, W, H, tryb) {
  const skala = tryb === 'wypelnij' ? Math.max(W / w, H / h) : Math.min(W / w, H / h);
  const sw = w * skala, sh = h * skala;
  return { x: (W - sw) / 2, y: (H - sh) / 2, w: sw, h: sh, skala };
}

const hexNaRgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);

export async function start(korzen) {
  let pozycje = [];        // {typ: 'pdf', zrodlo, nr, szer, wys, obrot} | {typ: 'obraz', bitmapa, szer, wys}
  const zrodla = [];       // {bajty, dokument (pdf.js), nazwa}
  let nazwaBazowa = 'karuzela';
  let kolorTla = '#FFFFFF';

  const format = lista(FORMATY, '1080x1350');
  const tryb = lista([['zmiesc', 'zmieść całość, reszta to tło'], ['wypelnij', 'wypełnij stronę, przytnij nadmiar']], 'zmiesc');
  const tlo = zetony([['#FFFFFF', 'Biały'], ...KOLORY], '#FFFFFF', { kolory: true });
  const typObrazow = lista([['image/jpeg', 'JPG'], ['image/png', 'PNG (ostrzejszy tekst, większe pliki)']], 'image/jpeg');
  const kafle = el('ul', { class: 'kafle drobne' });
  const stan = postep();
  const opis = el('p', { class: 'podpis' });
  const robocze = el('div', { hidden: true });
  const wymiary = () => format.value.split('x').map(Number);

  /** Rysuje jedną pozycję na płótnie W×H (pełny rozmiar albo miniatura). */
  async function narysuj(p, W, H) {
    const plotno = nowePlotno(W, H);
    const k = plotno.getContext('2d');
    k.fillStyle = kolorTla;
    k.fillRect(0, 0, W, H);
    const m = dopasuj(p.szer, p.wys, W, H, tryb.value);
    k.imageSmoothingQuality = 'high';
    if (p.typ === 'pdf') {
      const strona = await p.zrodlo.dokument.getPage(p.nr + 1);
      const obraz = await rysujStrone(strona, { skala: m.skala, tlo: '#FFFFFF' });
      k.drawImage(obraz, m.x, m.y, m.w, m.h);
      strona.cleanup();
    } else {
      k.drawImage(p.bitmapa, m.x, m.y, m.w, m.h);
    }
    return plotno;
  }

  let wersjaPodgladu = 0;
  async function podglad() {
    const wersja = ++wersjaPodgladu;
    robocze.hidden = pozycje.length === 0;
    if (!pozycje.length) return;
    const [W, H] = wymiary();
    const skala = 260 / Math.max(W, H);
    opis.textContent = `Stron: ${pozycje.length} · ${W}×${H} px.` + (pozycje.length > 20 ? ' Instagram przyjmuje do 20 obrazów w karuzeli.' : '');
    kafle.replaceChildren(...pozycje.map((_, i) => el('li', { class: 'kafel' }, el('div', { class: 'kafel-ramka' }), el('div', { class: 'kafel-opis bs-mono', text: String(i + 1).padStart(2, '0') }))));
    for (let i = 0; i < pozycje.length; i++) {
      const plotno = await narysuj(pozycje[i], Math.round(W * skala), Math.round(H * skala));
      if (wersja !== wersjaPodgladu) return;      // w międzyczasie zmieniono opcje
      kafle.children[i].firstElementChild.replaceChildren(plotno);
    }
  }
  for (const k of [format, tryb]) k.addEventListener('change', podglad);
  tlo.addEventListener('zmiana', () => { kolorTla = tlo.wartosc; podglad(); });

  async function dodaj(pliki) {
    let nr = 0;
    for (const plik of pliki) {
      nr++;
      stan.ustaw(`Wczytuję ${nr} z ${pliki.length}: ${plik.name}`, (nr - 1) / pliki.length);
      try {
        const bajty = new Uint8Array(await plik.arrayBuffer());
        if (!pozycje.length) nazwaBazowa = bezRozszerzenia(plik.name);
        if (String.fromCharCode(...bajty.subarray(0, 5)) === '%PDF-') {
          const dokument = await otworzPdf(bajty);
          const zrodlo = { bajty, dokument, nazwa: plik.name };
          zrodla.push(zrodlo);
          for (let i = 0; i < dokument.numPages; i++) {
            const strona = await dokument.getPage(i + 1);
            const widok = strona.getViewport({ scale: 1 });
            pozycje.push({ typ: 'pdf', zrodlo, nr: i, szer: widok.width, wys: widok.height, obrot: strona.rotate });
          }
        } else {
          const bitmapa = await naBitmape(plik);
          pozycje.push({ typ: 'obraz', bitmapa, szer: bitmapa.width, wys: bitmapa.height });
        }
      } catch (e) {
        stan.blad(`${plik.name}: ${opisBledu(e)}`);
        await new Promise((r) => setTimeout(r, 2500));
      }
    }
    stan.ukryj();
    podglad();
  }

  async function jakoPdf() {
    const [W, H] = wymiary();
    const { PDFDocument, rgb } = await wezPdfLib();
    const wynik = await PDFDocument.create();
    const osadzone = new Map();     // zrodlo → strony osadzone jako wektor
    for (const z of zrodla) {
      const numery = pozycje.filter((p) => p.typ === 'pdf' && p.zrodlo === z && !p.obrot).map((p) => p.nr);
      if (!numery.length) continue;
      try {
        const strony = await wynik.embedPdf(z.bajty, numery);
        osadzone.set(z, new Map(numery.map((n, i) => [n, strony[i]])));
      } catch { /* zaszyfrowany albo nietypowy plik: te strony pójdą jako obraz */ }
    }
    for (let i = 0; i < pozycje.length; i++) {
      const p = pozycje[i];
      stan.ustaw(`Składam PDF: strona ${i + 1} z ${pozycje.length}`, i / pozycje.length);
      const strona = wynik.addPage([W, H]);
      const wektor = p.typ === 'pdf' ? osadzone.get(p.zrodlo)?.get(p.nr) : null;
      if (wektor) {
        strona.drawRectangle({ x: 0, y: 0, width: W, height: H, color: rgb(...hexNaRgb(kolorTla)) });
        const m = dopasuj(wektor.width, wektor.height, W, H, tryb.value);
        strona.drawPage(wektor, { x: m.x, y: H - m.y - m.h, width: m.w, height: m.h });
      } else {
        const plotno = await narysuj(p, W, H);
        const jpg = await naBlob(plotno, 'image/jpeg', 0.92);
        strona.drawImage(await wynik.embedJpg(new Uint8Array(await jpg.arrayBuffer())), { x: 0, y: 0, width: W, height: H });
      }
    }
    return new Blob([await wynik.save()], { type: 'application/pdf' });
  }

  async function jakoObrazy() {
    const [W, H] = wymiary();
    const roz = typObrazow.value === 'image/png' ? 'png' : 'jpg';
    const pliki = [];
    for (let i = 0; i < pozycje.length; i++) {
      stan.ustaw(`Rysuję obraz ${i + 1} z ${pozycje.length}`, i / pozycje.length);
      const plotno = await narysuj(pozycje[i], W, H);
      pliki.push({ nazwa: `${nazwaBazowa}-${String(i + 1).padStart(2, '0')}.${roz}`, blob: await naBlob(plotno, typObrazow.value, 0.92) });
    }
    return zip(pliki);
  }

  const wykonaj = (praca, nazwa) => async (zdarzenie) => {
    const przycisk = zdarzenie.currentTarget;
    przycisk.disabled = true;
    try {
      const blob = await praca();
      pobierz(blob, nazwa());
      stan.ustaw(`Gotowe: ${nazwa()}, ${rozmiar(blob.size)}.`, 1);
    } catch (e) {
      stan.blad(opisBledu(e));
    }
    przycisk.disabled = false;
  };

  robocze.append(
    el('div', { class: 'opcje' },
      pole('Format strony', format),
      pole('Dopasowanie', tryb),
      pole('Tło', tlo),
      pole('Obrazy w ZIP-ie', typObrazow)),
    opis, kafle,
    el('div', { class: 'akcje' },
      el('button', { type: 'button', class: 'przycisk', text: 'Pobierz PDF (LinkedIn)', onclick: wykonaj(jakoPdf, () => `${nazwaBazowa}-karuzela.pdf`) }),
      el('button', { type: 'button', class: 'przycisk przycisk-cichy', text: 'Pobierz obrazy (ZIP)', onclick: wykonaj(jakoObrazy, () => `${nazwaBazowa}-karuzela.zip`) }),
      el('button', { type: 'button', class: 'link', text: 'Zacznij od nowa', onclick: () => { pozycje = []; zrodla.length = 0; podglad(); } })));

  korzen.append(
    strefa({ tytul: 'Upuść PDF albo grafiki, albo kliknij, żeby wybrać', opis: 'Prezentacja zapisana jako PDF albo kilka obrazów (JPG, PNG, HEIC). Każda strona i każdy obraz to jedna plansza.', accept: 'application/pdf,.pdf,image/*,.heic,.heif', wiele: true, naPliki: dodaj }),
    stan.el, robocze);
}
